FROM maven:3.9.16-amazoncorretto-21@sha256:6050e92c11f20014bf771ebfe892ec31b454249976d1017442ed01c7b654ef64 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
