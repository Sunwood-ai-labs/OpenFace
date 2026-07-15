FROM nginx:alpine

RUN apk add --no-cache openssl

COPY docker-entrypoint.d/10-openface-tls.sh /docker-entrypoint.d/10-openface-tls.sh
RUN chmod +x /docker-entrypoint.d/10-openface-tls.sh
