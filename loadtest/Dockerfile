FROM maven:3.10.0-amazoncorretto-21@sha256:ba6184681cbde686cfb290c8d2452df09efdc09d0e3af03fbb4fab44562e643e AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
