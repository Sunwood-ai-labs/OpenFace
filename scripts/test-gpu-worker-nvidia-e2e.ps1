param(
    [switch]$KeepContainers
)

$ErrorActionPreference = "Stop"
$network = "openface-gpu-nvidia-e2e"
$postgres = "openface-gpu-nvidia-postgres"
$repository = "openface-gpu-nvidia-repository"
$runner = "openface-gpu-nvidia-runner"
$worker = "openface-gpu-nvidia-worker"
$controlToken = "gpu-nvidia-e2e-control-token"
$fixtureRoot = Join-Path $PSScriptRoot "..\.tmp\gpu-nvidia-e2e"
$source = Join-Path $fixtureRoot "source"
$bare = Join-Path $fixtureRoot "public\git\demo\gpu-fixture.git"
$containers = @($worker, $runner, $repository, $postgres)

function Remove-E2EResources {
    foreach ($name in $containers) {
        if (docker ps -a --format "{{.Names}}" | Select-String -SimpleMatch $name) {
            docker rm -f $name | Out-Null
        }
    }
    if (docker network ls --format "{{.Name}}" | Select-String -SimpleMatch $network) {
        docker network rm $network | Out-Null
    }
    if (Test-Path -LiteralPath $fixtureRoot) {
        $resolved = (Resolve-Path -LiteralPath $fixtureRoot).Path
        $expected = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.tmp"))
        if (-not $resolved.StartsWith($expected, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove unexpected fixture path: $resolved"
        }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}

function Wait-Until([scriptblock]$Condition, [string]$Description, [int]$Attempts = 120) {
    foreach ($attempt in 1..$Attempts) {
        try {
            if (& $Condition) {
                return
            }
        } catch {
            # Startup and image build requests can transiently fail.
        }
        Start-Sleep -Seconds 1
    }
    throw "Timed out waiting for $Description"
}

Remove-E2EResources
try {
    New-Item -ItemType Directory -Force -Path $source | Out-Null
    Copy-Item -Path (Join-Path $PSScriptRoot "..\gpu-worker\fixtures\gpu-diagnostic\*") `
        -Destination $source -Recurse
    git -C $source init -q
    git -C $source config user.name "OpenFace GPU E2E"
    git -C $source config user.email "gpu-e2e@openface.local"
    git -C $source add .
    git -C $source commit -q -m "GPU diagnostic fixture"
    $revision = (git -C $source rev-parse HEAD).Trim()
    New-Item -ItemType Directory -Force -Path (Split-Path $bare) | Out-Null
    git clone -q --bare $source $bare
    git --git-dir=$bare update-server-info

    docker build -q -t openface-spaces-runner-nvidia-e2e ./spaces-runner | Out-Null
    docker build -q -t openface-gpu-worker-nvidia-e2e ./gpu-worker | Out-Null
    docker network create $network | Out-Null
    docker run -d --name $postgres --network $network `
        -e POSTGRES_USER=openface `
        -e POSTGRES_PASSWORD=test-password `
        -e POSTGRES_DB=openface_metrics `
        postgres:17-alpine | Out-Null
    docker run -d --name $repository --network $network `
        -v "$((Resolve-Path (Join-Path $fixtureRoot 'public')).Path):/usr/share/nginx/html:ro" `
        nginx:1.27-alpine | Out-Null

    Wait-Until {
        docker exec $postgres pg_isready -U openface -d openface_metrics 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } "PostgreSQL" 30

    docker run -d --name $runner --network $network -p 18001:8000 `
        -e DATABASE_URL=postgresql://openface:test-password@${postgres}:5432/openface_metrics `
        -e OPENFACE_CONTROL_TOKEN=$controlToken `
        -e OPENFACE_GPU_WORKERS_ENABLED=true `
        -e PUBLIC_BASE_URL=http://${repository} `
        -e OPENFACE_GPU_WORKER_LEASE_SECONDS=90 `
        -e OPENFACE_GPU_WORKER_STALE_SECONDS=120 `
        openface-spaces-runner-nvidia-e2e | Out-Null

    Wait-Until {
        return (Invoke-RestMethod http://localhost:18001/healthz).status -eq "ok"
    } "spaces-runner" 30

    $headers = @{"X-OpenFace-Control-Token" = $controlToken}
    $enrollment = Invoke-RestMethod -Method Post `
        -Uri http://localhost:18001/api/v1/workers/enrollment-tokens `
        -Headers $headers -ContentType "application/json" `
        -Body '{"name":"nvidia-e2e-worker","ttl_minutes":15}'

    docker run -d --name $worker --network $network --gpus all `
        -v /var/run/docker.sock:/var/run/docker.sock `
        -e OPENFACE_URL=http://${runner}:8000 `
        -e OPENFACE_API_PREFIX=api `
        -e WORKER_NAME=nvidia-e2e-worker `
        -e WORKER_PUBLIC_URL=http://${worker}:8787 `
        -e WORKER_DOCKER_NETWORK=$network `
        -e WORKER_ENROLLMENT_TOKEN=$($enrollment.token) `
        -e WORKER_DATA_DIR=/data `
        -e OPENFACE_VERIFY_TLS=false `
        -e WORKER_POLL_SECONDS=1 `
        openface-gpu-worker-nvidia-e2e | Out-Null

    Wait-Until {
        $script:workers = Invoke-RestMethod -Uri http://localhost:18001/api/v1/workers -Headers $headers
        return $workers.Count -eq 1 -and $workers[0].status -eq "online"
    } "NVIDIA worker registration" 30

    $jobBody = @{
        owner = "demo"
        repo = "gpu-fixture"
        revision = $revision
        requirements = @{
            gpu = $true
            min_vram_mb = 12288
            features = @("nvidia")
        }
    } | ConvertTo-Json -Depth 4
    Invoke-RestMethod -Method Post -Uri http://localhost:18001/api/v1/gpu/jobs `
        -Headers $headers -ContentType "application/json" -Body $jobBody | Out-Null

    Wait-Until {
        $script:status = Invoke-RestMethod http://localhost:18001/api/spaces/demo/gpu-fixture/status
        if ($status.status -eq "failed") {
            throw "GPU job failed: $($status.error)"
        }
        return $status.status -eq "running"
    } "real NVIDIA GPU job"

    $runtime = Invoke-RestMethod http://localhost:18001/demo/gpu-fixture/
    if ($runtime.status -ne "ok" -or $runtime.gpus.Count -lt 1) {
        throw "The Space container did not report an NVIDIA GPU"
    }

    $stop = Invoke-RestMethod -Method Post `
        -Uri http://localhost:18001/api/spaces/demo/gpu-fixture/stop `
        -Headers $headers
    Wait-Until {
        return (Invoke-RestMethod http://localhost:18001/api/spaces/demo/gpu-fixture/status).status -eq "stopped"
    } "remote stop" 30

    [pscustomobject]@{
        control_plane = "ok"
        worker = $workers[0].status
        worker_gpu_count = $workers[0].capabilities.gpu_count
        job = $status.status
        execution = $status.execution
        runtime = $runtime.runtime
        visible_gpus = $runtime.gpus
        stop_requested = $stop.status
        final_status = "stopped"
    } | ConvertTo-Json -Depth 4
} finally {
    if (-not $KeepContainers) {
        Remove-E2EResources
    }
}
