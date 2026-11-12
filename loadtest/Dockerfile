FROM maven:3.10.0-amazoncorretto-21@sha256:f7ccf5b5013cab77ba7f9137f5ce2fb573eb29791069d6cdd9bc9c1486065946 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
