FROM maven:3.9.16-amazoncorretto-21@sha256:8eba4f3c7158e760a9e2ffec33d91cf361ad6daa26639c339b66b54f99fcf38b AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
