#[derive(Debug)]
pub struct DbTransaction<'a> {
    _scope: std::marker::PhantomData<&'a mut ()>,
}

impl<'a> DbTransaction<'a> {
    pub fn placeholder() -> Self {
        Self {
            _scope: std::marker::PhantomData,
        }
    }
}
