FROM maven:3.9.15-amazoncorretto-21@sha256:6a9787080912b762cffcfd102beb097110d99a55b77708c6b5877d92a1e9039b AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
