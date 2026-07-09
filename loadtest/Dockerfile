FROM maven:3.9.16-amazoncorretto-21@sha256:cb0791f5fbbb01bec717ed7bcf217b2356fe46e25de16115566c96bcbb6fe343 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
