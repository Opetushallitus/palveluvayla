FROM maven:3.9.8-amazoncorretto-21@sha256:12ced8e1a5ad060aed3f30a7b430093de5889cef7894dd49a0d67a1a0d0a5a3a AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
