FROM maven:3.10.0-amazoncorretto-21@sha256:a8a8acb003f88f11da4ca0a7dc43971edad5f24a4c80c37436bf420e01007e51 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
