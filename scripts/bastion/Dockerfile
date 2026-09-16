FROM amazon/aws-cli:2.36.46@sha256:eedfdcb56e9a1b02fabcf656977ca226f40860c6672aca41d435e036bc95a075

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
