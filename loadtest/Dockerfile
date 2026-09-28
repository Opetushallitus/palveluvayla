FROM maven:3.9.16-amazoncorretto-21@sha256:2e441551de26290308235279a98a4fb289a92d495100f35bb277e798fe5b4cbc AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
