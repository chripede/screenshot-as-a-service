FROM wernight/phantomjs

ENV NODE_ENV production

USER root
ADD . /root/
WORKDIR /root/
RUN apt-get update && apt-get install -y optipng imagemagick curl

RUN curl -sL https://deb.nodesource.com/setup_8.x | bash -
RUN apt-get install nodejs
RUN apt-get clean

RUN npm install
RUN mkdir -p /tmp/web-screenshots/

EXPOSE 3000

ENTRYPOINT ["node", "app.js"]

