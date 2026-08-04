FROM maven:3.9.16-amazoncorretto-21@sha256:7c3052d0790870590b1e57ea50a3ef5849be79ff72a34d91e7cae96f2695d375 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
