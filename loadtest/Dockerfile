FROM maven:3.10.0-amazoncorretto-21@sha256:da3277177469e3727a1063a89533832b99fb9fd7dceaed19894026e65d357ca8 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
