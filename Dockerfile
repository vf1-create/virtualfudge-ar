FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY index.html 404.html sw.js manifest.webmanifest /srv/
COPY css /srv/css
COPY js /srv/js
COPY assets /srv/assets
COPY vendor /srv/vendor
COPY tools /srv/tools
