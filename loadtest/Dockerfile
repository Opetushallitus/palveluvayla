FROM maven:3.9.15-amazoncorretto-21@sha256:250f8e8e60e3f7818e1b0aca93db8a7802ecb4428e9c57699b0a530146204047 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
