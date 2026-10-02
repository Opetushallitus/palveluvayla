FROM maven:3.10.0-amazoncorretto-21@sha256:adf38080dc6a55a1a6bc83ad8e1ade0f4ca88a9636215e1be56d7a2af312805f AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
