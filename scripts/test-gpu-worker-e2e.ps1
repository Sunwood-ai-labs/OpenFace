param(
    [switch]$KeepContainers
)

$ErrorActionPreference = "Stop"
$network = "openface-gpu-e2e"
$postgres = "openface-gpu-e2e-postgres"
$runner = "openface-gpu-e2e-runner"
$worker = "openface-gpu-e2e-worker"
$controlToken = "gpu-e2e-control-token"
$containers = @($worker, $runner, $postgres)

function Remove-E2EResources {
    foreach ($name in $containers) {
        if (docker ps -a --format "{{.Names}}" | Select-String -SimpleMatch $name) {
            docker rm -f $name | Out-Null
        }
    }
    if (docker network ls --format "{{.Name}}" | Select-String -SimpleMatch $network) {
        docker network rm $network | Out-Null
    }
}

function Wait-Until([scriptblock]$Condition, [string]$Description) {
    foreach ($attempt in 1..30) {
        try {
            if (& $Condition) {
                return
            }
        } catch {
            # Services may reject requests while their startup transaction runs.
        }
        Start-Sleep -Seconds 1
    }
    throw "Timed out waiting for $Description"
}

Remove-E2EResources
try {
    docker build -q -t openface-spaces-runner-e2e ./spaces-runner | Out-Null
    docker build -q -t openface-gpu-worker-e2e ./gpu-worker | Out-Null
    docker network create $network | Out-Null
    docker run -d --name $postgres --network $network `
        -e POSTGRES_USER=openface `
        -e POSTGRES_PASSWORD=test-password `
        -e POSTGRES_DB=openface_metrics `
        postgres:17-alpine | Out-Null

    Wait-Until {
        docker exec $postgres pg_isready -U openface -d openface_metrics 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } "PostgreSQL"

    docker run -d --name $runner --network $network -p 18000:8000 `
        -e DATABASE_URL=postgresql://openface:test-password@${postgres}:5432/openface_metrics `
        -e OPENFACE_CONTROL_TOKEN=$controlToken `
        -e OPENFACE_GPU_WORKERS_ENABLED=true `
        -e PUBLIC_BASE_URL=http://${runner}:8000 `
        -e OPENFACE_GPU_WORKER_LEASE_SECONDS=30 `
        -e OPENFACE_GPU_WORKER_STALE_SECONDS=45 `
        openface-spaces-runner-e2e | Out-Null

    Wait-Until {
        return (Invoke-RestMethod http://localhost:18000/healthz).status -eq "ok"
    } "spaces-runner"

    $headers = @{"X-OpenFace-Control-Token" = $controlToken}
    $enrollment = Invoke-RestMethod -Method Post `
        -Uri http://localhost:18000/api/v1/workers/enrollment-tokens `
        -Headers $headers -ContentType "application/json" `
        -Body '{"name":"e2e-fake-gpu","ttl_minutes":15}'

    docker run -d --name $worker --network $network `
        -e OPENFACE_URL=http://${runner}:8000 `
        -e OPENFACE_API_PREFIX=api `
        -e WORKER_NAME=e2e-fake-gpu `
        -e WORKER_PUBLIC_URL=http://${worker}:8787 `
        -e WORKER_ENROLLMENT_TOKEN=$($enrollment.token) `
        -e WORKER_DATA_DIR=/data `
        -e OPENFACE_WORKER_FAKE_EXECUTOR=true `
        -e OPENFACE_VERIFY_TLS=false `
        -e WORKER_POLL_SECONDS=1 `
        openface-gpu-worker-e2e | Out-Null

    Wait-Until {
        $workers = Invoke-RestMethod -Uri http://localhost:18000/api/v1/workers -Headers $headers
        return $workers.Count -eq 1 -and $workers[0].status -eq "online"
    } "worker registration"

    Invoke-RestMethod -Method Post -Uri http://localhost:18000/api/v1/gpu/jobs `
        -Headers $headers -ContentType "application/json" `
        -Body '{"owner":"demo","repo":"gpu-fixture","revision":"0123456789abcdef","requirements":{"gpu":true,"min_vram_mb":12288,"features":["nvidia"]}}' | Out-Null

    Wait-Until {
        $script:status = Invoke-RestMethod http://localhost:18000/api/spaces/demo/gpu-fixture/status
        return $script:status.status -eq "running"
    } "GPU job"

    $runtime = Invoke-WebRequest -UseBasicParsing http://localhost:18000/demo/gpu-fixture/
    if ($runtime.StatusCode -ne 200 -or $runtime.Content -notmatch "OpenFace GPU worker E2E") {
        throw "Remote runtime proxy did not return the expected fixture"
    }

    $stop = Invoke-RestMethod -Method Post `
        -Uri http://localhost:18000/api/spaces/demo/gpu-fixture/stop `
        -Headers $headers
    Wait-Until {
        return (Invoke-RestMethod http://localhost:18000/api/spaces/demo/gpu-fixture/status).status -eq "stopped"
    } "remote stop"

    [pscustomobject]@{
        control_plane = "ok"
        worker = "online"
        job = $status.status
        execution = $status.execution
        runtime_status = $runtime.StatusCode
        stop_requested = $stop.status
        final_status = "stopped"
    } | ConvertTo-Json
} finally {
    if (-not $KeepContainers) {
        Remove-E2EResources
    }
}
