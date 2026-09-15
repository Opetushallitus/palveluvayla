FROM maven:3.9.16-amazoncorretto-21@sha256:f959c046a4013e2dc5e6a25272f69a42414dc8d08c42f4a2cab8f78c64226ddb AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
