FROM maven:3.9.16-amazoncorretto-21@sha256:ae694e8f35dfdb3f74f70f5f5cb3290d64fc7179f11cd9f0d493851c024aec77 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
