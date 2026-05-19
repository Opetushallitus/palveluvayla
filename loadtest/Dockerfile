FROM maven:3.9.16-amazoncorretto-21@sha256:141879c4499594c3d1181aeeccd5f6b563faed4ecc03a5635b4962657baefe19 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
