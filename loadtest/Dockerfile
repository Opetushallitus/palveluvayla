FROM maven:3.10.0-amazoncorretto-21@sha256:0ef83b8506e92f34278bf2acc3500ecf1f4bd2cd1159091e1f1e707adc73546a AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
