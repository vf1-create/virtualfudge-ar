FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY index.html 404.html sw.js manifest.webmanifest /srv/
COPY css /srv/css
COPY js /srv/js
COPY assets /srv/assets
COPY vendor /srv/vendor
COPY tools /srv/tools
# 404.html is written for GitHub Pages (/virtualfudge-ar/); this image serves the site at the domain root
RUN sed -i 's#/virtualfudge-ar/#/#g' /srv/404.html
