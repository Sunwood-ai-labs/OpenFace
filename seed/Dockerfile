FROM alpine:3.20

RUN apk add --no-cache curl jq git bash docker-cli

COPY seed.sh /seed.sh
COPY catalog/ /catalog/
RUN chmod +x /seed.sh

ENTRYPOINT ["/bin/bash", "/seed.sh"]
