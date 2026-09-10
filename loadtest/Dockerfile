FROM maven:3.9.16-amazoncorretto-21@sha256:9b051facf7f8a6378917c8b4d92396dd48122c2383d64c2979958bafe96bae8a AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
