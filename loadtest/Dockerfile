FROM maven:3.9.16-amazoncorretto-21@sha256:9475bf7955373d685ea6fb533cf1bbe434512deebe1d3ffc195cbd2babb13d35 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
