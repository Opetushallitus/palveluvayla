FROM maven:3.9.16-amazoncorretto-21@sha256:86e9a9a847b247d1f1f615cd19dae4620a05f3a76f16557fdea08f306a37ae7d AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
