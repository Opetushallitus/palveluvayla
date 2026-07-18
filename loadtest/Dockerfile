FROM maven:3.9.16-amazoncorretto-21@sha256:84cf4f913378b129a0cd5c3251ad24dfc4fe900689e24c0929c2ca9394b7a748 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
