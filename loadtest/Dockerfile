FROM maven:3.9.16-amazoncorretto-21@sha256:3809438e180ccfd901c7c74af796609328b1d81fe23945a0604153e5b47f17f1 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
