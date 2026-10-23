FROM maven:3.10.0-amazoncorretto-21@sha256:34e6397fb1f147a82f459a606dff4317159d204827bb06482ea61f01b1b07f27 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
