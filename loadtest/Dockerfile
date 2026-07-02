FROM maven:3.9.16-amazoncorretto-21@sha256:825646d3e530a9caec81a6a0e0cddea4d314bf5692b5861d52bf4e0d48277d08 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
