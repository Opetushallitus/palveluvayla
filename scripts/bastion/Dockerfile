FROM amazon/aws-cli:2.36.8@sha256:7e1b11a3c93bc5af81f496de0662f666b2352a4a6666e8ebae904fe102b131b6

ARG system_arch
RUN curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/linux_${system_arch}/session-manager-plugin.rpm" -o "session-manager-plugin.rpm"
RUN yum install -y session-manager-plugin.rpm
RUN yum install -y openssh-clients
RUN yum install -y nc

COPY session-manager-forward-psql.sh .

EXPOSE 2222
HEALTHCHECK --interval=1s --start-period=30s \
  CMD ["nc", "-z", "localhost", "2222"]
ENTRYPOINT ["./session-manager-forward-psql.sh"]
