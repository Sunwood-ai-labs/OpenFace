# トラブルシューティング

## カタログが空

`docker compose logs seed` を確認します。seedはForgejoを待ち、adminとAPI tokenを作成または再利用し、カタログをimportして終了します。最初のerrorを直して `docker compose up seed` を再実行します。

## Spaceがbuildingまたはerrorのまま

`docker compose logs spaces-runner` とSpace status endpointを確認します。依存installの失敗、`Dockerfile` 不在、port `7860` でlistenしていないことが主な原因です。

## 証明書警告が出る

ローカル生成証明書は自己署名です。自分が管理するhostだけで受け入れるか、[運用](./operations.md#tls)の手順でtrusted certificateへ交換します。

## Pagesのstyleが崩れる

static generatorのbaseを `/pages/OWNER/REPOSITORY/` にします。`gh-pages` にproject sourceではなくbuild済みファイルがあることも確認します。

## private repositoryが公開された

security issueとして扱います。deploymentを止め、credentialを除いたlogを保存し、`SECURITY.md` のprivate reporting手順を使ってください。
