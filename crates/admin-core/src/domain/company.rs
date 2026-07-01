#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Company {
    pub id: i64,
    pub name: String,
    pub create_at: String,
    pub update_at: String,
    pub order_count: i64,
}

impl Company {
    pub fn new(
        id: i64,
        name: impl Into<String>,
        create_at: impl Into<String>,
        update_at: impl Into<String>,
        order_count: i64,
    ) -> Self {
        Self {
            id,
            name: name.into(),
            create_at: create_at.into(),
            update_at: update_at.into(),
            order_count,
        }
    }
}
