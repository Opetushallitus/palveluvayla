FROM maven:3.10.0-amazoncorretto-21@sha256:f64fd4f0363c918004816d83d2589495b622a8d2fc5c5602c135cb4124c7ea12 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
