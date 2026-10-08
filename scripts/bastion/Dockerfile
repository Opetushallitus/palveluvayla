FROM amazon/aws-cli:2.37.11@sha256:d55d5b391f1cc0d428a05eb07408bb1a730d7df9f656008f1117ed5e13b0c083

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
