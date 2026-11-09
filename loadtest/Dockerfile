FROM maven:3.10.0-amazoncorretto-21@sha256:313b3afb28619c7374224b8bb65f9f6cae1dffce3b172e1bd8afe85e4cf05610 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
