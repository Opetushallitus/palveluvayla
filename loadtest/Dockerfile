FROM maven:3.9.16-amazoncorretto-21@sha256:9e8aa99b4a55060004696aea04eb698ffaf3098752d682f56dd73cca0ed7dae4 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
