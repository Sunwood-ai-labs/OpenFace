# OpenFace Pages

publicリポジトリの静的ファイルを次のURLで配信します。

```text
https://HOST/pages/OWNER/REPOSITORY/
```

最初に `gh-pages` branchのrootを探し、なければdefault branchの `docs/` を配信します。private repositoryは `404` となり、Pages cardも表示しません。

## VitePressとForgejo Actions

seedされる `vitepress-pages-starter` にworkflow一式があります。`main` をcheckoutし、依存関係をinstallし、repository固有のbase pathでbuildして、出力だけを `gh-pages` へpushします。

Actions jobは専用のDocker-in-Dockerで動きます。Spacesが使うホストDocker socketからdocumentation buildを分離しています。

## そのほかのframework

Vite、Reactのstatic export、Vue、Astro、HTML/CSS/JavaScriptなど、静的ファイルを生成できれば同じ仕組みで公開できます。server-side applicationはDocker Spaceとして公開します。
