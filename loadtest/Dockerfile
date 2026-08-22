FROM maven:3.9.16-amazoncorretto-21@sha256:81de222c1f34ac467bf968e1800b73fb41e714427c0212ba004296ea972e808a AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
