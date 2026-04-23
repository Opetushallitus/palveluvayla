FROM maven:3.9.15-amazoncorretto-21@sha256:f8d43a6d1a55d93764fe81bc91f670e233289bd63ca2f5ab3544db3d65edbf82 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
