# OpenFace — customized Forgejo image
#
# We don't fork Forgejo; instead we bake the official "custom" override
# mechanism (templates + static assets) into the image and point
# GITEA_CUSTOM at it. curl is already present in the upstream image and is
# used by the compose healthcheck, so no extra packages are installed.
FROM codeberg.org/forgejo/forgejo:11

ENV GITEA_CUSTOM=/custom

COPY custom/ /custom/
