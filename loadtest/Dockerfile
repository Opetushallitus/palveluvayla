FROM maven:3.9.14-amazoncorretto-21@sha256:d3714a5bc06461ff50520a7ab9480a9e4d27f71941bb3cbdb615720379b89048 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
