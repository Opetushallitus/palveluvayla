FROM maven:3.10.0-amazoncorretto-21@sha256:9f817dbf24e058d433223e72d59c4f89cc9ca4634f053a9e40debfe09a234ffa AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
