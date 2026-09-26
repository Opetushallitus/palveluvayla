FROM maven:3.9.16-amazoncorretto-21@sha256:56c7800dada0a02e9cd8207fed40aa85bb76d0c118744691bba42ab103dc91e2 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
