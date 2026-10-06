FROM maven:3.10.0-amazoncorretto-21@sha256:9b868ffa88a46d8b4e605fa14db1e0debe2edb798b3b5890156e92d55a17b11b AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
