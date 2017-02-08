FROM nolimitid/node-phantom

ENV NODE_ENV production

USER root
ADD . /root/
WORKDIR /root/
RUN apt install -y optipng imagemagick
RUN npm install
RUN mkdir -p /tmp/web-screenshots/

EXPOSE 3000

ENTRYPOINT ["node", "app.js"]

