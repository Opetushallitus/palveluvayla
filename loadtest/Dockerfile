FROM maven:3.9.16-amazoncorretto-21@sha256:4d7e521cabcb4e93b7547ebd9adc86f7fd1b3dfc0a498d9e3eb2c1ca0c5c2ea7 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
