FROM maven:3.9.12-amazoncorretto-21@sha256:def455126ccc18635cb64779d592bbe2558cb9bd6fed23c154918c90111b78b5 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
