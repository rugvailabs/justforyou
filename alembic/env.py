from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import get_settings

# Importing the models package registers every table on Base.metadata,
# which is what autogenerate diffs against.
import app.models  # noqa: F401
from app.models.base import Base

# Alembic Config object, providing access to alembic.ini values.
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# The database URL comes from Settings, never from alembic.ini - unless a
# caller has already set one programmatically (the test fixtures point this at
# a scratch database). '%' is escaped because ConfigParser treats it as
# interpolation syntax.
if not config.get_main_option("sqlalchemy.url", None):
    config.set_main_option(
        "sqlalchemy.url", get_settings().database_url.replace("%", "%%")
    )

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Emit SQL to a script instead of running against a live database."""
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live database connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
