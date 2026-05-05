FROM maven:3.9.15-amazoncorretto-21@sha256:afdfee19c37218effbfa9b4e26af69e92d5def766e3a862c30c311a241fa78a7 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
