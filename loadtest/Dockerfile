FROM maven:3.10.0-amazoncorretto-21@sha256:ee4b48cb042170113f138374d8fa1f34641088137811528dcac01116fcf17c9a AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
