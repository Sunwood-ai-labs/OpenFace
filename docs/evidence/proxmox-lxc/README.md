# Proxmox LXC verification

Verified on 2026-07-24 against LXC `101` (`openface`, Ubuntu 24.04).

- Docker and nested Space containers start successfully.
- All core Compose services return to `Up` after an LXC reboot.
- PostgreSQL retains 105 repositories, 53 issues, and all application data.
- `https://192.168.11.22:8443/` returns HTTP 200.
- `openface/qr-code-generator` builds, runs, and remains running after reboot.
- Browser navigation increments the migrated view count.

| Home | Running Space |
|---|---|
| ![LAN home](home-lan.png) | ![Running QR Space](qr-space-running.png) |
