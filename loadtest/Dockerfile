FROM maven:3.9.15-amazoncorretto-21@sha256:5068c1ec617d5a4a09b6c717631401312cfe5b233bb0c3f16c377d929121101d AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
